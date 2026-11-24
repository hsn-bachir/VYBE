<?php

namespace App\Http\Requests\MovieNights;

use Illuminate\Validation\Validator;

class CastMovieNightVoteRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), ['night' => $this->route('night')]);
    }

    public function rules(): array
    {
        return parent::rules() + ['movie_night_movie_id' => self::ID_RULES];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['movie_night_movie_id']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
