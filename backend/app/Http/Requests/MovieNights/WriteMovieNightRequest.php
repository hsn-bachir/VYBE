<?php

namespace App\Http\Requests\MovieNights;

use App\Services\MovieNights\MovieNightRules;
use Illuminate\Validation\Validator;

class WriteMovieNightRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), $this->isMethod('PATCH') ? ['night' => $this->route('night')] : []);
    }

    protected function prepareForValidation(): void
    {
        foreach (['title', 'location', 'meeting_url'] as $field) {
            if (is_string($this->input($field))) {
                $this->merge([$field => trim($this->input($field))]);
            }
        }
    }

    public function rules(): array
    {
        return app(MovieNightRules::class)->eventFields($this->isMethod('PATCH'))
            + ($this->isMethod('PATCH') ? parent::rules() : []);
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $fields = array_keys(app(MovieNightRules::class)->eventFields());
            foreach (array_diff(array_keys($this->all()), $fields) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            if ($this->isMethod('PATCH') && ! $this->hasAny($fields)) {
                $validator->errors()->add('title', 'Include at least one editable field.');
            }
        }];
    }
}
