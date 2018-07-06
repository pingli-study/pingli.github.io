import actionBuilder from 'action-builder'
import backend from 'backend'
import _ from 'lodash'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import {select} from 'store'

export const recipePath = (recipeId, path) => {
    const recipeTabIndex = select('process.tabs')
        .findIndex((recipe) => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        throw new Error(`Recipe not found: ${recipeId}`)
    if (path && Array.isArray(path))
        path = path.join('.')
    return ['process.tabs', recipeTabIndex, path]
        .filter(e => e !== undefined)
        .join('.')
}

export const RecipeState = (recipeId) => {
    if (!recipeExists(recipeId))
        return null

    return (path) =>
        select(recipePath(recipeId, path))
}

export const saveRecipe = (recipe) => {
    if (!recipe.type)
        return
    const listItem = {
        id: recipe.id,
        name: recipe.title || recipe.placeholder,
        type: recipe.type
    }
    const recipes = [...select('process.recipes')]
    const index = recipes.findIndex(savedRecipe => savedRecipe.id === recipe.id)
    if (index > -1)
        recipes[index] = listItem
    else
        recipes.push(listItem)

    backend.recipe.save$(recipe).pipe(
        map(() => {
            actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .dispatch()
        })
    ).subscribe()
}

export const exportRecipe = (recipe) => {
    setTimeout(() => {
        const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(_.omit(recipe, ['ui']), null, 2))
        var downloadElement = document.createElement('a')
        downloadElement.setAttribute('href', data)
        downloadElement.setAttribute('download', `${recipe.title || recipe.placeholder}.json`)
        document.body.appendChild(downloadElement)
        downloadElement.click()
        downloadElement.remove()
    }, 0)
}

export const loadRecipes$ = () =>
    backend.recipe.loadAll$().pipe(
        map((recipes) => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .build())
    )

export const deleteRecipe = (recipeId) =>
    backend.recipe.delete$(recipeId).pipe(
        map(() => {
            const recipes = select('process.recipes')
                .filter(recipe => recipe.id !== recipeId)
            actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .dispatch()
        })
    ).subscribe()

export const loadRecipe$ = (recipeId) => {
    const selectedTabId = select('process.selectedTabId')
    if (recipeExists(recipeId)) {
        const recipe = select(recipePath(recipeId))
        return of([
            actionBuilder('SELECT_RECIPE')
                .set('process.selectedTabId', recipe.id)
                .build()
        ])
    } else {
        return backend.recipe.load$(recipeId).pipe(
            map(recipe =>
                actionBuilder('OPEN_RECIPE')
                    .set(recipePath(selectedTabId), recipe)
                    .set('process.selectedTabId', recipe.id)
                    .build())
        )
    }
}

const recipeExists = (recipeId) =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1
