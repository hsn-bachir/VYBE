<?php

namespace App\Services;

use App\Exceptions\AvatarUnavailable;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class AvatarService
{
    public function replace(User $user, UploadedFile $upload): void
    {
        $bytes = $this->encode($upload);
        $path = 'avatars/'.$user->id.'/'.bin2hex(random_bytes(16)).'.webp';
        try {
            if (! Storage::disk('public')->put($path, $bytes)) {
                throw new AvatarUnavailable;
            }
        } catch (Throwable) {
            $this->cleanup($user->id, '/'.$path);
            throw new AvatarUnavailable;
        }
        try {
            $old = DB::transaction(function () use ($user, $path): ?string {
                $current = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
                $old = $current->getRawOriginal('avatar_url');
                $current->avatar_url = '/'.$path;
                $current->save();

                return $old;
            }, 3);
        } catch (Throwable $error) {
            $this->cleanup($user->id, '/'.$path);
            throw $error;
        }
        $this->cleanup($user->id, $old);
    }

    public function remove(User $user): void
    {
        $old = DB::transaction(function () use ($user): ?string {
            $current = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $old = $current->getRawOriginal('avatar_url');
            $current->avatar_url = null;
            $current->save();

            return $old;
        }, 3);
        $this->cleanup($user->id, $old);
    }

    private function cleanup(int $owner, ?string $reference): void
    {
        if (! $reference || ! preg_match('#^/avatars/'.preg_quote((string) $owner, '#').'/[a-f0-9]{32}\.webp$#D', $reference)) {
            return;
        }
        try {
            if (Storage::disk('public')->delete(substr($reference, 1))) {
                return;
            }
        } catch (Throwable) { /* The committed identity stays usable even if cleanup fails. */
        }
        Log::warning('Unable to remove an obsolete managed avatar.', ['user_id' => $owner]);
    }

    private function encode(UploadedFile $upload): string
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            throw new AvatarUnavailable;
        }
        $info = @getimagesize($upload->getRealPath());
        if (! $info || ! in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true) || $info['mime'] !== $upload->getMimeType()
            || $info[0] < 1 || $info[1] < 1 || $info[0] > 2048 || $info[1] > 2048 || $upload->getSize() > 2 * 1024 * 1024) {
            throw ValidationException::withMessages(['avatar' => ['Choose a valid JPEG, PNG or WebP up to 2 MiB and 2048 × 2048 pixels.']]);
        }
        $image = @imagecreatefromstring(file_get_contents($upload->getRealPath()));
        if (! $image) {
            throw ValidationException::withMessages(['avatar' => ['This image could not be decoded.']]);
        }
        try {
            if ($info['mime'] === 'image/jpeg' && function_exists('exif_read_data')) {
                $orientation = (int) (@exif_read_data($upload->getRealPath())['Orientation'] ?? 1);
                $angle = match ($orientation) {
                    3, 4 => 180, 5, 6 => -90, 7, 8 => 90, default => 0
                };
                if ($angle) {
                    $image = imagerotate($image, $angle, 0);
                }
                if (in_array($orientation, [2, 4, 5, 7], true)) {
                    imageflip($image, IMG_FLIP_HORIZONTAL);
                }
            }
            $scale = min(1, 512 / max(imagesx($image), imagesy($image)));
            $output = imagecreatetruecolor(max(1, (int) round(imagesx($image) * $scale)), max(1, (int) round(imagesy($image) * $scale)));
            imagealphablending($output, false);
            imagesavealpha($output, true);
            imagecopyresampled($output, $image, 0, 0, 0, 0, imagesx($output), imagesy($output), imagesx($image), imagesy($image));
            ob_start();
            try {
                if (! imagewebp($output, null, 85)) {
                    throw new AvatarUnavailable;
                } $bytes = ob_get_contents();
            } finally {
                ob_end_clean();
            }

            return $bytes;
        } finally {
            unset($image, $output);
        }
    }
}
