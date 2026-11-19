<?php

namespace App\Http\Requests\Auth;

use App\Rules\AccountPasswordRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class FirebaseAcceptInvitationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => Str::lower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
            'password' => [Rule::requiredIf(! $this->has('id_token')), ...array_slice(AccountPasswordRules::rules(), 1)],
            'password_confirmation' => [Rule::requiredIf($this->has('password')), 'string'],
            'id_token' => [Rule::requiredIf(! $this->has('password')), 'string', 'max:8192'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if (! $this->isJson()) {
                $validator->errors()->add('body', 'Send a JSON body.');
            }
            foreach (array_diff(array_keys($this->json()->all()), ['email', 'token', 'password', 'password_confirmation', 'id_token']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            if ($this->query->all()) {
                $validator->errors()->add('query', 'Query fields are not allowed.');
            }
            if ($this->has('password') && $this->has('id_token')) {
                $validator->errors()->add('id_token', 'Choose one invitation sign-in method.');
            }
        }];
    }
}
