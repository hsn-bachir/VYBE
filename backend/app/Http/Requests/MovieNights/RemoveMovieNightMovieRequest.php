<?php

namespace App\Http\Requests\MovieNights;

class RemoveMovieNightMovieRequest extends ShowMovieNightRequest
{
    public function validationData(): array
    {
        return parent::validationData() + ['movie' => $this->route('movie')];
    }

    public function rules(): array
    {
        return parent::rules() + ['movie' => self::ID_RULES];
    }
}
