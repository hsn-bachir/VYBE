<?php

namespace App\Http\Requests\Movies;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class DiscoverMoviesRequest extends ListMoviesRequest
{
    public const GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];

    public function rules(): array
    {
        return parent::rules() + [
            'category' => ['sometimes', 'required', Rule::in(['popular', 'trending', 'top_rated', 'now_playing', 'upcoming'])],
            'sort' => ['sometimes', 'required', Rule::in(['popularity.desc', 'vote_average.desc', 'primary_release_date.asc', 'primary_release_date.desc', 'title.asc', 'title.desc'])],
            'genres' => ['sometimes', 'required', 'array', 'max:19'],
            'genres.*' => ['required', 'integer', Rule::in(self::GENRES)],
            'genre_match' => ['sometimes', 'required', Rule::in(['any', 'all'])],
            'year_from' => ['sometimes', 'required', 'integer', 'between:1888,2100'],
            'year_to' => ['sometimes', 'required', 'integer', 'between:1888,2100'],
            'rating_min' => ['sometimes', 'required', 'numeric', 'between:0,10'],
            'runtime_min' => ['sometimes', 'required', 'integer', 'between:0,600'],
            'runtime_max' => ['sometimes', 'required', 'integer', 'between:0,600'],
            'original_language' => ['sometimes', 'required', 'string', 'regex:/^[a-z]{2}$/D'],
            'query' => ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach ([['year_from', 'year_to'], ['runtime_min', 'runtime_max']] as [$min, $max]) {
                if (is_numeric($this->input($min)) && is_numeric($this->input($max)) && $this->input($min) > $this->input($max)) {
                    $validator->errors()->add($max, 'The maximum must be at least the minimum.');
                }
            }
            if ($this->input('category') === 'trending') {
                foreach (['sort', 'runtime_min', 'runtime_max'] as $field) {
                    if ($this->has($field)) {
                        $validator->errors()->add($field, 'Trending preserves provider order and has no runtime metadata.');
                    }
                }
            }
        }];
    }

    /** Stable types and set ordering keep equivalent requests on one cache entry. */
    public function discovery(): array
    {
        $values = $this->validated();
        $result = ['category' => $values['category'] ?? 'popular', 'page' => (int) ($values['page'] ?? 1)];
        if ($result['category'] !== 'trending') {
            $result['sort'] = $values['sort'] ?? ($result['category'] === 'top_rated' ? 'vote_average.desc' : 'popularity.desc');
        }
        if (! empty($values['genres'])) {
            $result['genres'] = array_values(array_unique(array_map('intval', $values['genres'])));
            sort($result['genres']);
            $result['genre_match'] = $values['genre_match'] ?? 'any';
        }
        foreach (['year_from', 'year_to', 'runtime_min', 'runtime_max'] as $field) {
            if (isset($values[$field])) {
                $result[$field] = (int) $values[$field];
            }
        }
        if (isset($values['rating_min']) && (float) $values['rating_min'] > 0) {
            $result['rating_min'] = (float) $values['rating_min'];
        }
        if (isset($values['original_language'])) {
            $result['original_language'] = $values['original_language'];
        }

        return $result;
    }
}
