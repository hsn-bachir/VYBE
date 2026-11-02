<?php

namespace App\Http\Requests\Ratings;

use App\Http\Requests\Movies\ShowMovieRequest;
use Closure;
use Illuminate\Validation\Validator;

class RatingRequest extends ShowMovieRequest
{
    public function validationData(): array
    {
        return parent::validationData() + ($this->isMethod('PUT') ? ['rating' => $this->json('rating')] : []);
    }

    public function rules(): array
    {
        return parent::rules() + ($this->isMethod('PUT') ? ['rating' => ['required', function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value) || $value < 1 || $value > 5) {
                $fail('The rating must be a JSON integer between 1 and 5.');
            }
        }]] : []);
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = $this->isMethod('PUT') && $this->isJson() ? ['rating'] : [];
            foreach (array_diff(array_keys($this->all()), $allowed) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            foreach (array_keys($this->query->all()) as $field) {
                $validator->errors()->add($field, 'Query fields are not allowed.');
            }
            if ($this->isMethod('PUT') && ! $this->isJson()) {
                $validator->errors()->add('rating', 'Send the rating in a JSON request body.');
            }
        }];
    }
}
