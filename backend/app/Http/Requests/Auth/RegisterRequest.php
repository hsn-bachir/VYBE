<?php

namespace App\Http\Requests\Auth;

use App\Rules\UsernameRules;
use App\Rules\AccountPasswordRules;
use Illuminate\Support\Str;

class RegisterRequest extends LoginRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->username)) {
            $this->merge(['username' => Str::lower(trim($this->username))]);
        }
    }

    public function rules(): array
    {
        return [
            'username' => UsernameRules::rules(),
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => AccountPasswordRules::rules(),
            'role' => ['prohibited'],
            'account_status' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return ['username.regex' => 'Use only lowercase letters, numbers, and underscores.', 'username.not_in' => 'This username is reserved.'];
    }
}
