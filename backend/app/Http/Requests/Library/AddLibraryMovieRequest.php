<?php

namespace App\Http\Requests\Library;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class AddLibraryMovieRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['tmdb_id' => ['required', function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value) || $value < 1 || $value > 2147483647) {
                $fail('The :attribute field must be an integer between 1 and 2147483647.');
            }
        }]];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['tmdb_id']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
