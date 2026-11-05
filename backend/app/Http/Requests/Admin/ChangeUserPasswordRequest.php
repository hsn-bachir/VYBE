<?php

namespace App\Http\Requests\Admin;

use App\Rules\AccountPasswordRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ChangeUserPasswordRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('reason'))) $this->merge(['reason' => trim($this->input('reason'))]);
    }

    public function validationData(): array
    {
        return array_merge($this->isJson() ? $this->json()->all() : $this->request->all(), ['id' => $this->route('id')]);
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'],
            'admin_current_password' => ['required', 'string'],
            'password' => AccountPasswordRules::rules(),
            'password_confirmation' => ['required', 'string'],
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if (! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
            foreach (array_diff(array_keys($this->json()->all()), ['admin_current_password', 'password', 'password_confirmation', 'reason']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            if ($this->query->all()) $validator->errors()->add('query', 'Query fields are not allowed.');
        }];
    }
}
