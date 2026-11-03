<?php

namespace App\Http\Requests\Profile;

use App\Rules\UsernameRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

class ProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->isMethod('PATCH') && $this->isJson()) {
            $values = [];
            if (is_string($this->json('username'))) {
                $values['username'] = Str::lower(trim($this->json('username')));
            }
            if (is_string($this->json('bio'))) {
                $bio = preg_replace('/\A[\s\p{Z}]+|[\s\p{Z}]+\z/u', '', $this->json('bio'));
                $values['bio'] = $bio === '' ? null : $bio;
            }
            $this->merge($values);
        }
    }

    public function rules(): array
    {
        if ($this->isMethod('PATCH')) {
            return [
                'username' => ['sometimes', ...UsernameRules::rules((int) $this->user()->id)],
                'bio' => ['sometimes', 'nullable', 'string', 'max:500'],
            ];
        }
        if ($this->isMethod('POST')) {
            return ['avatar' => ['required', 'file', 'max:2048', 'mimetypes:image/jpeg,image/png,image/webp', 'dimensions:min_width=1,min_height=1,max_width=2048,max_height=2048']];
        }

        return [];
    }

    public function validationData(): array
    {
        return $this->isMethod('PATCH') ? $this->json()->all() : $this->all();
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = $this->isMethod('PATCH') ? ['username', 'bio'] : ($this->isMethod('POST') ? ['avatar'] : []);
            $body = $this->isJson() ? $this->json()->all() : array_merge($this->request->all(), $this->allFiles());
            foreach (array_diff(array_keys($body), $allowed) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            foreach (array_keys($this->query->all()) as $key) {
                $validator->errors()->add($key, 'This query field is not allowed.');
            }
            if ($this->isMethod('PATCH') && (! $this->isJson() || ! array_intersect(array_keys($body), $allowed))) {
                $validator->errors()->add('body', 'Send username or bio in a JSON body.');
            }
            if ($this->isMethod('POST') && ! str_starts_with(strtolower($this->header('Content-Type', '')), 'multipart/form-data')) {
                $validator->errors()->add('avatar', 'Send the avatar as a multipart upload.');
            }
        }];
    }
}
