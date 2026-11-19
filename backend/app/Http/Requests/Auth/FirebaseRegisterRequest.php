<?php

namespace App\Http\Requests\Auth;

use App\Rules\UsernameRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

class FirebaseRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('username'))) {
            $this->merge(['username' => Str::lower(trim($this->input('username')))]);
        }
    }

    public function rules(): array
    {
        return [
            'username' => UsernameRules::format(),
            'id_token' => ['required', 'string', 'max:8192'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['username', 'id_token']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
        }];
    }
}
