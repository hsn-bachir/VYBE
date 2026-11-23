<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AdminActivityAnalytics
{
    private const CONTRIBUTION_TABLES = [
        'reviews' => 'reviews',
        'ratings' => 'movie_ratings',
        'watched_entries' => 'watched_movies',
    ];

    public function report(int $range): array
    {
        $today = now('UTC')->toImmutable()->startOfDay();
        $start = $today->subDays($range - 1);
        $end = $today->addDay();
        $tables = ['registrations' => 'users'] + self::CONTRIBUTION_TABLES;
        $totals = array_fill_keys(array_keys($tables), 0);
        $days = [];
        for ($date = $start; $date < $end; $date = $date->addDay()) {
            $days[$date->toDateString()] = ['date' => $date->toDateString()] + $totals;
        }

        $withinPeriod = fn (string $table) => DB::table($table)->where('created_at', '>=', $start)->where('created_at', '<', $end);
        $daily = $withinPeriod('users')->selectRaw("'registrations' AS metric, DATE(created_at) AS day, COUNT(*) AS total")
            ->groupByRaw('DATE(created_at)');
        foreach (self::CONTRIBUTION_TABLES as $metric => $table) {
            $daily->unionAll($withinPeriod($table)->selectRaw('? AS metric, DATE(created_at) AS day, COUNT(*) AS total', [$metric])
                ->groupByRaw('DATE(created_at)'));
        }

        $users = $withinPeriod('reviews')->select('user_id')
            ->unionAll($withinPeriod('movie_ratings')->select('user_id'))
            ->unionAll($withinPeriod('watched_movies')->select('user_id'));
        $contributors = DB::query()->fromSub($users, 'contributions')
            ->selectRaw("'contributors' AS metric, NULL AS day, COUNT(DISTINCT user_id) AS total");

        // All aggregates read the same statement snapshot, including contributor deduplication.
        $activeContributors = 0;
        foreach ($daily->unionAll($contributors)->get() as $row) {
            $count = (int) $row->total;
            if ($row->metric === 'contributors') {
                $activeContributors = $count;

                continue;
            }
            $days[$row->day][$row->metric] = $count;
            $totals[$row->metric] += $count;
        }

        return [
            'range_days' => $range,
            'timezone' => 'UTC',
            'start_date' => $start->toDateString(),
            'end_date' => $today->toDateString(),
            'days' => array_values($days),
            'totals' => $totals,
            'active_contributors' => $activeContributors,
        ];
    }
}
