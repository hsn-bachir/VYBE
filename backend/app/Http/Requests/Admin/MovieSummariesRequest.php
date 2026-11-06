<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class MovieSummariesRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'tmdb_ids' => ['required', 'array', 'min:1', 'max:50'],
            'tmdb_ids.*' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647', 'distinct'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->query->all()), ['tmdb_ids']) as $field) {
                $validator->errors()->add($field, 'This query field is not allowed.');
            }
            if (is_array($this->query('tmdb_ids')) && ! array_is_list($this->query('tmdb_ids'))) {
                $validator->errors()->add('tmdb_ids', 'The movie IDs must be a list.');
            }
            if ($this->request->all()) $validator->errors()->add('body', 'This request has no body fields.');
        }];
    }
}
