<?php

namespace App\Http\Requests\MovieNights;

use App\Enums\MovieNightStatus;
use App\Http\Requests\Library\ListLibraryRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ListMovieNightsRequest extends ListLibraryRequest
{
    public function validationData(): array
    {
        return $this->query();
    }

    public function rules(): array
    {
        return parent::rules() + ['status' => ['sometimes', 'required', Rule::enum(MovieNightStatus::class)]];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->query()), ['page', 'per_page', 'status']) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
        }];
    }
}
