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
import { VmType } from './vmType';
import { PowerState } from './powerState';
import { ConsoleConnectionInfo } from './consoleConnectionInfo';


export interface Vm { 
    /**
     * Virtual Machine unique id
     */
    id?: string;
    /**
     * Url to the Vm\'s console
     */
    url?: string | null;
    /**
     * The Vm\'s name
     */
    name?: string | null;
    /**
     * Id of the Vm\'s owner if it is a personal Vm
     */
    userId?: string | null;
    /**
     * A list of networks that a regular user can access
     */
    allowedNetworks?: Array<string> | null;
    powerState?: PowerState;
    /**
     * A list of IP addresses of the Vm
     */
    ipAddresses?: Array<string> | null;
    /**
     * The Ids of the Team\'s the Vm is a part of
     */
    teamIds?: Array<string> | null;
    /**
     * True if this Vm currently has pending tasks (power on, power off, etc)
     */
    hasPendingTasks?: boolean;
    consoleConnectionInfo?: ConsoleConnectionInfo;
    type?: VmType;
}

