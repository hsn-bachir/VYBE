<?php

return ['ttl_seconds' => max(10, min(900, (int) env('RECOMMENDATIONS_TTL_SECONDS', 120)))];
