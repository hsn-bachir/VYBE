<?php

namespace App\Http\Requests\Collections;

use App\Http\Requests\Library\AddLibraryMovieRequest;

class AddCollectionMovieRequest extends AddLibraryMovieRequest
{
    public function validationData(): array
    {
        return array_merge($this->all(), ['id' => $this->route('id')]);
    }

    public function rules(): array
    {
        return parent::rules() + ['id' => ShowCollectionRequest::ID_RULES];
    }
}
