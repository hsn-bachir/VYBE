<?php

namespace App\Rules;

use Illuminate\Validation\Rules\Password;

class AccountPasswordRules
{
    public static function rules(): array
    {
        return ['required', 'string', 'max:255', 'confirmed', Password::min(12)->letters()->numbers()];
    }
}
