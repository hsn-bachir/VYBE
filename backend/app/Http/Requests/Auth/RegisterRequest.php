<?php

namespace App\Http\Requests\Auth;

use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

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
            'username' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[a-z0-9_]+$/', Rule::notIn(['admin', 'support', 'system', 'root', 'vybe']), Rule::unique('users', 'username')],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::min(12)->letters()->numbers()],
        ];
    }

    public function messages(): array
    {
        return ['username.regex' => 'Use only lowercase letters, numbers, and underscores.', 'username.not_in' => 'This username is reserved.'];
    }
}
