<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\ProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Services\AvatarService;
use App\Services\ProfileService;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class ProfileController extends Controller
{
    public function __construct(private ProfileService $profiles, private AvatarService $avatars) {}

    public function show(ProfileRequest $request): ProfileResource
    {
        return new ProfileResource($this->profiles->read($request->user()));
    }

    public function update(ProfileRequest $request): ProfileResource
    {
        return new ProfileResource($this->profiles->update($request->user(), $request->safe()->only(['username', 'bio'])));
    }

    public function upload(ProfileRequest $request): ProfileResource
    {
        $this->avatars->replace($request->user(), $request->file('avatar'));

        return new ProfileResource($this->profiles->read($request->user()));
    }

    public function remove(ProfileRequest $request): ProfileResource
    {
        $this->avatars->remove($request->user());

        return new ProfileResource($this->profiles->read($request->user()));
    }

    public function image(string $owner, string $filename): Response
    {
        $stream = Storage::disk('public')->readStream('avatars/'.$owner.'/'.$filename);
        if (! is_resource($stream)) {
            return response('', 404)->header('X-Content-Type-Options', 'nosniff');
        }

        return response()->stream(function () use ($stream): void {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200,
            ['Content-Type' => 'image/webp', 'X-Content-Type-Options' => 'nosniff', 'Content-Security-Policy' => "default-src 'none'", 'Cache-Control' => 'public, max-age=31536000, immutable']);
    }
}
