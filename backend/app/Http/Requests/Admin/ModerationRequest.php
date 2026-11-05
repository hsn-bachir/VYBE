<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ModerationRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if ($this->isJson() && is_string($this->json('reason'))) {
            $this->merge(['reason' => Str::trim($this->json('reason'))]);
        }
    }

    public function validationData(): array
    {
        return array_merge($this->isMethod('GET') ? $this->query->all() : $this->json()->all(),
            $this->route('id') !== null ? ['id' => $this->route('id')] : []);
    }

    public function rules(): array
    {
        $id = $this->route('id') !== null ? ['id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647']] : [];
        if ($this->isMethod('GET')) {
            if ($this->route('id') !== null) return $id;
            $rules = ['page' => ['sometimes', 'required', 'integer', 'between:1,10000'],
                'per_page' => ['sometimes', 'required', 'integer', 'between:1,50']];
            if ($this->is('api/v1/admin/reports')) return $rules + [
                'status' => ['sometimes', 'required', Rule::in(['pending', 'resolved', 'dismissed'])],
                'target_type' => ['sometimes', 'required', Rule::in(['review'])],
            ];
            if ($this->is('api/v1/admin/reviews')) return $rules + [
                'visibility' => ['sometimes', 'required', Rule::in(['visible', 'hidden'])],
                'tmdb_id' => ['sometimes', 'required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'],
            ];
            return $rules + [
                'target_type' => ['sometimes', 'required', Rule::in(['user', 'review', 'report'])],
                'target_id' => ['sometimes', 'required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'],
            ];
        }
        $common = ['reason' => ['required', 'string', 'min:1', 'max:1000']];
        if (str_ends_with($this->path(), '/resolve')) return $id + $common + ['action' => ['required', Rule::in(['hide', 'mark_spoiler'])]];
        if (str_ends_with($this->path(), '/dismiss')) return $id + $common;
        if (str_ends_with($this->path(), '/visibility')) return $id + $common + ['visibility' => ['required', Rule::in(['visible', 'hidden'])]];
        return $id + $common + ['moderator_spoiler' => ['required', function (string $attribute, mixed $value, $fail): void {
            if (! is_bool($value)) $fail('The moderator_spoiler field must be a JSON boolean.');
        }]];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = array_diff(array_keys($this->rules()), ['id']);
            foreach (array_diff(array_keys($this->query->all()), $this->isMethod('GET') ? $allowed : []) as $field) {
                $validator->errors()->add($field, 'This query field is not allowed.');
            }
            $body = $this->isJson() ? $this->json()->all() : $this->request->all();
            foreach (array_diff(array_keys($body), $this->isMethod('GET') ? [] : $allowed) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            if (! $this->isMethod('GET') && ! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
        }];
    }
}
