<?php

namespace App\Http\Requests\MovieNights;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ShowMovieNightRequest extends FormRequest
{
    public const ID_RULES = ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'min:1', 'max:'.PHP_INT_MAX];

    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return ['night' => $this->route('night')];
    }

    public function rules(): array
    {
        return ['night' => self::ID_RULES];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_keys($this->all()) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
