<?php

namespace App\Http\Requests\Movies;

use Illuminate\Foundation\Http\FormRequest;

class ShowMovieRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return ['tmdb_id' => $this->route('tmdb_id')];
    }

    public function rules(): array
    {
        return ['tmdb_id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'min:1', 'max:2147483647']];
    }
}
