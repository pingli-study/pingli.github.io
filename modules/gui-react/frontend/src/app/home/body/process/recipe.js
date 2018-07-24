import actionBuilder from 'action-builder'
import backend from 'backend'
import JSZip from 'jszip'
import _ from 'lodash'
import {from, of, Subject} from 'rxjs'
import {map, switchMap} from 'rxjs/operators'
import {select, subscribe} from 'store'

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
    if (!isRecipeOpen(recipeId))
        return null

    return (path) =>
        select(recipePath(recipeId, path))
}

export const saveRecipe$ = (recipe) => {
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

    return of(
        actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .sideEffect(() => saveToBackend$.next(recipe))
            .build()
    )
}

export const saveRecipe = (recipe) =>
    saveRecipe$(recipe).subscribe(action => action.dispatch())

export const exportRecipe = (recipe) => {
    const name = `${recipe.title || recipe.placeholder}`
    const recipeString = JSON.stringify(_.omit(recipe, ['ui']), null, 2)
    from(new JSZip().file(name + '.json', recipeString).generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 5
        }
    })).pipe(
        map(zippedRecipe => {
            const data = window.URL.createObjectURL(zippedRecipe)
            var downloadElement = document.createElement('a')
            downloadElement.setAttribute('href', data)
            downloadElement.setAttribute('download', name + '.zip')
            document.body.appendChild(downloadElement)
            downloadElement.click()
            downloadElement.remove()
            window.URL.revokeObjectURL(data)
        })
    ).subscribe()
}

export const loadRecipes$ = () =>
    backend.recipe.loadAll$().pipe(
        map((recipes) => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .build())
    )

export const loadRecipe$ = (recipeId) => {
    const selectedTabId = select('process.selectedTabId')
    if (isRecipeOpen(recipeId)) {
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

export const duplicateRecipe$ = (recipeId) => {
    const selectedTabId = select('process.selectedTabId')
    return backend.recipe.load$(recipeId).pipe(
        map(recipe => ({
                ...recipe,
                id: selectedTabId,
                title: (recipe.title || recipe.placeholder) + '_copy'
            })
        ),
        switchMap(duplicate =>
            saveRecipe$(duplicate).pipe(
                map(action => [
                    action,
                    actionBuilder('SELECT_RECIPE', {duplicate})
                        .set(recipePath(selectedTabId), duplicate)
                        .build()
                ])
            )
        )
    )
}


export const deleteRecipe$ = (recipeId) =>
    backend.recipe.delete$(recipeId).pipe(
        map(() => {
            const recipes = select('process.recipes')
                .filter(recipe => recipe.id !== recipeId)
            return actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .build()
        })
    )

export const deleteRecipe = (recipeId) =>
    deleteRecipe$(recipeId).subscribe(action => action.dispatch())


const isRecipeOpen = (recipeId) =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1

const saveToBackend$ = new Subject()

let prevTabs = []
subscribe('process.tabs', (recipes) => {
        if (recipes && (prevTabs.length === 0 || prevTabs !== recipes)) {
            const recipesToSave = recipes
                .filter(recipe =>
                    (select('process.recipes') || []).find(saved =>
                        saved.id === recipe.id
                    )
                )
                .filter(recipe => {
                    const prevRecipe = prevTabs.find(prevRecipe => prevRecipe.id === recipe.id) || {}
                    return prevRecipe.model && !_.isEqual(prevRecipe.model, recipe.model)
                })
            if (recipesToSave.length > 0) {
                recipesToSave.forEach(recipe => saveToBackend$.next(recipe))
            }
            prevTabs = recipes
        }
    }
)

saveToBackend$.pipe(
    switchMap(recipe => backend.recipe.save$(recipe))
).subscribe()