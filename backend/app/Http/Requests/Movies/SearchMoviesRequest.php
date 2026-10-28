<?php

namespace App\Http\Requests\Movies;

class SearchMoviesRequest extends ListMoviesRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('query'))) {
            $this->merge(['query' => trim(preg_replace('/\s+/u', ' ', $this->input('query')) ?? '')]);
        }
    }

    public function rules(): array
    {
        return parent::rules() + ['query' => ['required', 'string', 'max:200']];
    }
}
