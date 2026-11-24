<?php

namespace App\Http\Requests\MovieNights;

use App\Http\Requests\Library\ListLibraryRequest;
use Illuminate\Validation\Validator;

class ListMovieNightInvitationsRequest extends ListLibraryRequest
{
    public function validationData(): array
    {
        return array_merge($this->query(), $this->route('night') !== null ? ['night' => $this->route('night')] : []);
    }

    public function rules(): array
    {
        return parent::rules() + ($this->route('night') !== null ? ['night' => ShowMovieNightRequest::ID_RULES] : []);
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = array_diff(array_keys($this->rules()), ['night']);
            foreach (array_diff(array_keys($this->all()), $allowed) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
