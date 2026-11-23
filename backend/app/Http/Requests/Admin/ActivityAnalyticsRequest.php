<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ActivityAnalyticsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return $this->query->all();
    }

    public function rules(): array
    {
        return ['range' => ['sometimes', 'required', 'integer', Rule::in([7, 30, 90])]];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->query->all()), ['range']) as $field) {
                $validator->errors()->add($field, 'This query field is not allowed.');
            }
        }];
    }
}
