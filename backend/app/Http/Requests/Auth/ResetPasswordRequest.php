<?php

namespace App\Http\Requests\Auth;

use App\Rules\AccountPasswordRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) $this->merge(['email' => Str::lower(trim($this->input('email')))]);
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string', 'regex:/^[A-Za-z0-9]{64}$/D'],
            'password' => AccountPasswordRules::rules(),
            'password_confirmation' => ['required', 'string'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if (! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
            foreach (array_diff(array_keys($this->json()->all()), ['email', 'token', 'password', 'password_confirmation']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            if ($this->query->all()) $validator->errors()->add('query', 'Query fields are not allowed.');
        }];
    }
}
