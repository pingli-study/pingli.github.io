package org.openforis.sepal.component.budget.event

import org.openforis.sepal.component.budget.api.UserStorageUse
import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserStorageQuotaNotExceeded implements Event {
    UserStorageUse userStorageUse
}
