<?php

namespace App\Http\Requests\Reviews;

use App\Http\Requests\Movies\ShowMovieRequest;
use Closure;
use Illuminate\Validation\Validator;

class ReviewRequest extends ShowMovieRequest
{
    private function listing(): bool
    {
        return $this->isMethod('GET') && $this->is('api/v1/movies/*/reviews');
    }

    protected function prepareForValidation(): void
    {
        if ($this->isJson() && is_string($this->json('body'))) {
            $this->merge(['body' => preg_replace('/\A[\s\p{Z}]+|[\s\p{Z}]+\z/u', '', $this->json('body'))]);
        }
    }

    public function validationData(): array
    {
        $data = $this->isMethod('GET') ? $this->query->all() : $this->json()->all();

        return array_merge($data, parent::validationData(), ['review_id' => $this->route('review_id')]);
    }

    public function rules(): array
    {
        $rules = parent::rules();
        if ($this->route('review_id') !== null) {
            $rules['review_id'] = $rules['tmdb_id'];
        }
        if ($this->listing()) {
            $rules += ['page' => ['sometimes', 'required', 'integer', 'between:1,10000'], 'per_page' => ['sometimes', 'required', 'integer', 'between:1,50']];
        }
        if ($this->isMethod('POST') || $this->isMethod('PATCH')) {
            $rules['body'] = $this->isMethod('POST') ? ['required', 'string', 'min:1', 'max:5000'] : ['sometimes', 'required', 'string', 'min:1', 'max:5000'];
            $rules['contains_spoilers'] = ['sometimes', 'required', function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_bool($value)) {
                    $fail('The contains_spoilers field must be a JSON boolean.');
                }
            }];
        }

        return $rules;
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $write = $this->isMethod('POST') || $this->isMethod('PATCH');
            $body = $this->isJson() ? $this->json()->all() : $this->request->all();
            foreach (array_diff(array_keys($body), $write ? ['body', 'contains_spoilers'] : []) as $field) {
                $validator->errors()->add($field, 'This field is not allowed.');
            }
            foreach (array_diff(array_keys($this->query->all()), $this->listing() ? ['page', 'per_page'] : []) as $field) {
                $validator->errors()->add($field, 'This query field is not allowed.');
            }
            if ($write && ! $this->isJson()) {
                $validator->errors()->add('body', 'Send a JSON request body.');
            }
            if ($this->isMethod('PATCH') && ! array_intersect(array_keys($body), ['body', 'contains_spoilers'])) {
                $validator->errors()->add('body', 'Include body or contains_spoilers.');
            }
        }];
    }
}
