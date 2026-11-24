<?php

namespace App\Http\Requests\MovieNights;

use Illuminate\Validation\Validator;

class CreateMovieNightInvitationRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), ['night' => $this->route('night')]);
    }

    public function rules(): array
    {
        return parent::rules() + ['invited_user_id' => self::ID_RULES];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), ['invited_user_id']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
