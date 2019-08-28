const SmtLib = require('./SmtLib.js');
const Web3 = require('web3');
const bigInt = require('big-integer');
const AWS = require('aws-sdk');

let provider = process.env.provider;
const web3 = new Web3(provider);

let contract_abi = [{"constant":true,"inputs":[],"name":"balances","outputs":[{"name":"DEPTH","type":"uint8"},{"name":"root","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_initialSupply","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_address","type":"address"},{"indexed":true,"name":"_value","type":"bytes32"}],"name":"Write","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":true,"name":"spender","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"account","type":"address"},{"name":"balance","type":"uint256"},{"name":"proof","type":"bytes"}],"name":"balanceOf","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"sender_balance","type":"uint256"},{"name":"sender_proof","type":"bytes"},{"name":"recipient","type":"address"},{"name":"recipient_balance","type":"uint256"},{"name":"recipient_proof","type":"bytes"},{"name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"sender","type":"address"},{"name":"sender_balance","type":"uint256"},{"name":"sender_proof","type":"bytes"},{"name":"recipient","type":"address"},{"name":"recipient_balance","type":"uint256"},{"name":"recipient_proof","type":"bytes"},{"name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}];
let contract_address = process.env.contract_address;

const contract = new web3.eth.Contract(contract_abi, contract_address);

const docClient = new AWS.DynamoDB.DocumentClient({region: process.env.region});

exports.handler = async (event) => {

    //d
    let leaves;
    let currBlock;

    let params = {
        Key: {
            index: 0
        },
        TableName: 'Leaves'
    };
    //get data from db
    try {
        let data = await docClient.get(params).promise();
        currBlock = data.Item.blockNumber;
        leaves = data.Item.leaves;
    } catch (e) {
        console.log(e);
    }
    //get data from contract events since the last block that was written to db
    let events = await contract.getPastEvents('Write', {fromBlock: currBlock});
    for (let i = 0; i < events.length; i++) {
      currBlock = events[i].blockNumber;
      leaves[events[i].returnValues[0]] = events[i].returnValues[1];
    }
    //write actual data to db
    params = {
        TableName: 'Leaves',
        Key : {
            index: 0
        },
        UpdateExpression: 'set blockNumber = :b, leaves = :l',
        ExpressionAttributeValues: {
            ":b" : currBlock,
            ":l" : leaves
        },
        ReturnValues:"UPDATED_NEW"
    };

    try {
        let data = await docClient.update(params).promise();
        console.log(data);
    } catch (e) {
        console.log(e);
    }

    //Users input
    let address = event.queryStringParameters.address;
    if (web3.utils.isAddress(address) || web3.utils.isAddress(address.toLowerCase())) {
        address = web3.utils.toChecksumAddress(address);
    } else {
        return { statusCode: 200, body: JSON.stringify({message : 'Invalid address. Wrong input in requested parameter - address.'}) };
    }

    //balanceof
    let tree = new SmtLib(160, leaves);

    let balance;
    if (address in leaves) {
        balance = leaves[address];
        balance = bigInt(balance.substring(2), 16).toString();
    } else {
        balance = '0';
    }
    let proof = tree.createMerkleProof(address);
    let output = {
        'address' : address,
        'balance' : balance,
        'proof' : proof
    };



    const response = {
        statusCode: 200,
        body: JSON.stringify(output),
    };
    return response;
};
