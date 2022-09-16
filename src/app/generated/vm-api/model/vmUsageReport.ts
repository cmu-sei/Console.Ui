/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

/**
 * Player VM API
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: v1
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


export interface VmUsageReport { 
    sessionId?: string;
    sessionName?: string | null;
    sessionStart?: Date;
    sessionEnd?: Date;
    vmId?: string;
    vmName?: string | null;
    ipAddress?: string | null;
    userId?: string;
    userName?: string | null;
    minutesActive?: number;
}

