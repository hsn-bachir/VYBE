<?php

namespace App\Rules;

use Illuminate\Validation\Rule;

class UsernameRules
{
    public static function rules(?int $except = null): array
    {
        return ['required', 'string', 'min:3', 'max:30', 'regex:/^[a-z0-9_]+$/', Rule::notIn(['admin', 'support', 'system', 'root', 'vybe']), Rule::unique('users', 'username')->ignore($except)];
    }
}
