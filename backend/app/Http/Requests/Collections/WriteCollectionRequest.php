<?php

namespace App\Http\Requests\Collections;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class WriteCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return array_merge($this->all(), $this->isMethod('PATCH') ? ['id' => $this->route('id')] : []);
    }

    protected function prepareForValidation(): void
    {
        foreach (['name', 'description'] as $field) {
            if (is_string($this->input($field))) {
                $value = trim($this->input($field));
                $this->merge([$field => $field === 'description' && $value === '' ? null : $value]);
            }
        }
    }

    public function rules(): array
    {
        return ['name' => [$this->isMethod('PATCH') ? 'sometimes' : 'required', 'required', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000']]
            + ($this->isMethod('PATCH') ? ['id' => ShowCollectionRequest::ID_RULES] : []);
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['name', 'description']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            if ($this->isMethod('PATCH') && ! $this->hasAny(['name', 'description'])) {
                $validator->errors()->add('name', 'Include a name or description to update.');
            }
        }];
    }
}
