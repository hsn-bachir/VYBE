<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Rules\UsernameRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class CreateAdminUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $values = [];
        if (is_string($this->input('username'))) {
            $values['username'] = Str::lower(trim($this->input('username')));
        }
        if (is_string($this->input('email'))) {
            $values['email'] = Str::lower(trim($this->input('email')));
        }
        $this->merge($values);
    }

    public function rules(): array
    {
        return [
            'username' => UsernameRules::rules(),
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => config('firebase_auth.mode') === 'firebase'
                ? ['sometimes', Rule::in([User::ROLE_USER, User::ROLE_MODERATOR])]
                : ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $body = $this->isJson() ? $this->json()->all() : $this->request->all();
            foreach (array_diff(array_keys($body), ['username', 'email', 'role']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            foreach (array_keys($this->query->all()) as $key) {
                $validator->errors()->add($key, 'This query field is not allowed.');
            }
            if (! $this->isJson()) {
                $validator->errors()->add('body', 'Send a JSON body.');
            }
        }];
    }
}
