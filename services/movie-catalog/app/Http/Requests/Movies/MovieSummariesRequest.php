<?php

namespace App\Http\Requests\Movies;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

class MovieSummariesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'tmdb_ids' => ['bail', 'required', 'array', 'list', 'min:1', 'max:50', function (string $attribute, mixed $value, Closure $fail): void {
                // Associative decoding otherwise makes a JSON object with numeric keys look like a list.
                $body = json_decode($this->getContent());
                if (! is_object($body) || ! is_array($body->tmdb_ids ?? null)) {
                    $fail('The :attribute field must be a JSON array.');
                }
            }],
            'tmdb_ids.*' => ['bail', 'required', function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_int($value) || $value < 1 || $value > 2147483647) {
                    $fail('The :attribute field must be an integer between 1 and 2147483647.');
                }
            }],
        ];
    }
}
