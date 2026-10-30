<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Movie extends Model
{
    protected $fillable = [
        'tmdb_id', 'title', 'original_title', 'overview', 'poster_path',
        'backdrop_path', 'release_date', 'runtime', 'original_language',
        'genres', 'tmdb_rating', 'tmdb_vote_count', 'metadata_fetched_at',
    ];

    protected function casts(): array
    {
        return [
            'tmdb_id' => 'integer',
            'release_date' => 'date:Y-m-d',
            'runtime' => 'integer',
            'genres' => 'array',
            'tmdb_rating' => 'decimal:2',
            'tmdb_vote_count' => 'integer',
            'metadata_fetched_at' => 'datetime',
        ];
    }
}
