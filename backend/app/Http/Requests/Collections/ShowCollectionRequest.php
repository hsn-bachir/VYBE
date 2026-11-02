<?php

namespace App\Http\Requests\Collections;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ShowCollectionRequest extends FormRequest
{
    public const ID_RULES = ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'];

    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return ['id' => $this->route('id'), 'tmdb_id' => $this->route('tmdb_id')];
    }

    public function rules(): array
    {
        return ['id' => self::ID_RULES] + ($this->route('tmdb_id') !== null ? ['tmdb_id' => self::ID_RULES] : []);
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->isMethod('DELETE')) {
                foreach (array_keys($this->all()) as $field) {
                    $validator->errors()->add($field, 'This field is not allowed.');
                }
            }
        }];
    }
}
