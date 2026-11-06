<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ModerationActionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'actor' => $this->actor ? ['id' => $this->actor->id, 'username' => $this->actor->username] : null,
            'action' => $this->action, 'target_type' => $this->target_type, 'target_id' => $this->target_id,
            'reason' => $this->reason, 'details' => $this->details, 'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
