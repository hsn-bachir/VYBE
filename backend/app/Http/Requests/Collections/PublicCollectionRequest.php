<?php

namespace App\Http\Requests\Collections;

use App\Http\Requests\Library\ListLibraryRequest;
use Illuminate\Validation\Validator;

class PublicCollectionRequest extends ListLibraryRequest
{
    public function validationData(): array
    {
        return array_merge($this->query(), ['id' => $this->route('id')]);
    }

    public function rules(): array
    {
        return ['id' => ShowCollectionRequest::ID_RULES]
            + ($this->routeIs('public-collections.show') ? [] : parent::rules());
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = $this->routeIs('public-collections.show') ? [] : ['page', 'per_page'];
            foreach (array_diff(array_keys($this->query()), $allowed) as $field) {
                $validator->errors()->add($field, 'This query field is not allowed.');
            }
            if ($this->getContent() !== '' || $this->request->count() > 0 || $this->allFiles() !== []) {
                $validator->errors()->add('body', 'A request body is not allowed.');
            }
        }];
    }
}
