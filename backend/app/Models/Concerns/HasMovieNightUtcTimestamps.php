<?php

namespace App\Models\Concerns;

/** Keep Movie Night instants independent of PostgreSQL's session timezone. */
trait HasMovieNightUtcTimestamps
{
    protected function asDateTime($value)
    {
        // PostgreSQL returns timestamptz in the session zone with an offset.
        // Preserve that instant and expose dates consistently in UTC.
        return parent::asDateTime($value)->utc();
    }

    public function fromDateTime($value)
    {
        if (empty($value)) {
            return $value;
        }

        $date = $this->asDateTime($value);

        // An explicit offset prevents PostgreSQL interpreting UTC wall time
        // in its session zone. Other drivers retain their existing SQL format.
        return $this->getConnection()->getDriverName() === 'pgsql'
            ? $date->format('Y-m-d H:i:sP')
            : parent::fromDateTime($date);
    }
}
