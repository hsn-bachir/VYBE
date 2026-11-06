<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use App\Rules\AccountPasswordRules;
use Illuminate\Validation\Validator;

class AcceptInvitationRequest extends FormRequest
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
            'token' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
            'password' => AccountPasswordRules::rules(),
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $body = $this->isJson() ? $this->json()->all() : $this->request->all();
            foreach (array_diff(array_keys($body), ['email', 'token', 'password', 'password_confirmation']) as $key) $validator->errors()->add($key, 'This field is not allowed.');
            foreach (array_keys($this->query->all()) as $key) $validator->errors()->add($key, 'This query field is not allowed.');
            if (! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
        }];
    }
}
