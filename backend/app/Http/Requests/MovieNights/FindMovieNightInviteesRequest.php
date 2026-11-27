<?php

namespace App\Http\Requests\MovieNights;

class FindMovieNightInviteesRequest extends ListMovieNightInvitationsRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->query('query'))) {
            $this->query->set('query', strtolower(trim($this->query('query'))));
        }
    }

    public function rules(): array
    {
        return parent::rules() + ['query' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[a-z0-9_]+$/D']];
    }
}
