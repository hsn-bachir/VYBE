<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\PublicProfileRequest;
use App\Http\Resources\PublicProfileResource;
use App\Services\ProfileService;

class PublicProfileController extends Controller
{
    public function __invoke(PublicProfileRequest $request, ProfileService $profiles): PublicProfileResource
    {
        return new PublicProfileResource($profiles->publicProfile((int) $request->validated('id')));
    }
}
