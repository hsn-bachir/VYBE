<?php

namespace App\Http\Requests\Profile;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class PublicProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return ['id' => $this->route('id')];
    }

    public function rules(): array
    {
        return ['id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647']];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_keys($this->query->all()) as $key) {
                $validator->errors()->add($key, 'This query field is not allowed.');
            }
            if ($this->getContent() !== '' || $this->request->count() > 0 || $this->allFiles() !== []) {
                $validator->errors()->add('body', 'A request body is not allowed.');
            }
        }];
    }
}
