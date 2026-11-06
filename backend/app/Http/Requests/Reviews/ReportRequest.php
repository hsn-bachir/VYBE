<?php

namespace App\Http\Requests\Reviews;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ReportRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if ($this->isJson() && is_string($this->json('description'))) {
            $this->merge(['description' => Str::trim($this->json('description'))]);
        }
    }

    public function validationData(): array
    {
        return array_merge($this->json()->all(), [
            'tmdb_id' => $this->route('tmdb_id'), 'review_id' => $this->route('review_id'),
        ]);
    }

    public function rules(): array
    {
        $id = ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'];
        return [
            'tmdb_id' => $id, 'review_id' => $id,
            'reason' => ['required', Rule::in(['harassment', 'hate', 'spam', 'spoiler', 'other'])],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->json()->all()), ['reason', 'description']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            foreach (array_keys($this->query->all()) as $field) $validator->errors()->add($field, 'This query field is not allowed.');
            if (! $this->isJson()) $validator->errors()->add('body', 'Send a JSON request body.');
        }];
    }
}
