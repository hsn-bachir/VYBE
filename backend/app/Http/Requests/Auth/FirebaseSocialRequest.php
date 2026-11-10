<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class FirebaseSocialRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id_token' => ['required', 'string', 'max:8192'],
            'provider' => ['required', 'string', Rule::in(['google.com', 'github.com'])],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['id_token', 'provider']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
        }];
    }
}
