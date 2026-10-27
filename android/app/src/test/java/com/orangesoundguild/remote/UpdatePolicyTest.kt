package com.orangesoundguild.remote

import org.junit.Assert.*
import org.junit.Test

class UpdatePolicyTest {
    @Test fun onlyNewerBuildsAreUpdates() {
        assertTrue(UpdatePolicy.isNewer(5, 6))
        assertFalse(UpdatePolicy.isNewer(6, 6))
        assertFalse(UpdatePolicy.isNewer(6, 5))
    }

    @Test fun checksumMustBeFullSha256() {
        assertTrue(UpdatePolicy.validHash("ab".repeat(32)))
        assertFalse(UpdatePolicy.validHash("ab".repeat(31)))
        assertFalse(UpdatePolicy.validHash("zz".repeat(32)))
    }
}