<?php

namespace App\Http\Requests\Collections;

use App\Http\Requests\Library\ListLibraryRequest;

class ListCollectionsRequest extends ListLibraryRequest
{
    public function validationData(): array
    {
        return array_merge($this->query(), $this->route('id') !== null ? ['id' => $this->route('id')] : []);
    }

    public function rules(): array
    {
        return parent::rules() + ($this->route('id') !== null
            ? ['id' => ShowCollectionRequest::ID_RULES]
            : ['contains_tmdb_id' => ['sometimes', ...ShowCollectionRequest::ID_RULES],
                'include_previews' => ['sometimes', 'boolean']]);
    }
}
