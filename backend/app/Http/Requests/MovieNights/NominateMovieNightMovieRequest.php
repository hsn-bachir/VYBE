<?php

namespace App\Http\Requests\MovieNights;

use Illuminate\Validation\Validator;

class NominateMovieNightMovieRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), ['night' => $this->route('night')]);
    }

    public function rules(): array
    {
        return parent::rules() + ['tmdb_id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647']];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['tmdb_id']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
