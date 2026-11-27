<?php

namespace App\Http\Requests\MovieNights;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RespondMovieNightRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), ['night' => $this->route('night')]);
    }

    public function rules(): array
    {
        return parent::rules() + ['rsvp_status' => ['required', 'string', Rule::in(['accepted', 'declined'])]];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['rsvp_status']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
