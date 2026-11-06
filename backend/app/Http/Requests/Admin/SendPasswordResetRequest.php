<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SendPasswordResetRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('reason'))) $this->merge(['reason' => trim($this->input('reason')) ?: null]);
    }

    public function validationData(): array
    {
        return array_merge($this->isJson() ? $this->json()->all() : $this->request->all(), ['id' => $this->route('id')]);
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'],
            'reason' => ['nullable', 'string', 'min:1', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if (! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
            foreach (array_diff(array_keys($this->json()->all()), ['reason']) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            if ($this->query->all()) $validator->errors()->add('query', 'Query fields are not allowed.');
        }];
    }
}
